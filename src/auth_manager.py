#!/usr/bin/env python3
"""
Sistema de Autenticação com JWT
Gerencia usuários locais e autenticação via JWT
"""

import sqlite3
import hashlib
import secrets
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Tuple
import jwt

logger = logging.getLogger(__name__)


class AuthManager:
    """Gerenciador de autenticação"""
    
    def __init__(self, db_file: str = '/var/lib/bgp_failover/auth.db',
                 jwt_secret: str = None):
        """
        Inicializa gerenciador de autenticação
        
        Args:
            db_file: Arquivo de banco de dados de autenticação
            jwt_secret: Chave secreta para JWT (gerada se não fornecida)
        """
        self.db_file = db_file
        self.jwt_secret = jwt_secret or self._load_or_create_secret()
        self._init_db()
    
    def _load_or_create_secret(self) -> str:
        """Carrega ou cria chave secreta JWT"""
        secret_file = Path('/etc/bgp_failover/jwt_secret.key')
        
        if secret_file.exists():
            with open(secret_file, 'r') as f:
                return f.read().strip()
        else:
            secret = secrets.token_urlsafe(32)
            secret_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(secret_file, 'w') as f:
                f.write(secret)
            
            secret_file.chmod(0o600)
            logger.info(f"Chave JWT criada: {secret_file}")
            
            return secret
    
    def _init_db(self):
        """Inicializa banco de dados de autenticação"""
        Path(self.db_file).parent.mkdir(parents=True, exist_ok=True)
        
        with sqlite3.connect(self.db_file) as conn:
            # Tabela de usuários
            conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    email TEXT,
                    full_name TEXT,
                    role TEXT DEFAULT 'user',
                    enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME
                )
            ''')
            
            # Tabela de tokens
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT UNIQUE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME NOT NULL,
                    revoked BOOLEAN DEFAULT 0,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
            ''')
            
            # Tabela de auditoria de login
            conn.execute('''
                CREATE TABLE IF NOT EXISTS login_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    success BOOLEAN NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
            
            # Criar usuário admin padrão se não existir
            self._create_default_admin()
    
    def _create_default_admin(self):
        """Cria usuário admin padrão"""
        try:
            with sqlite3.connect(self.db_file) as conn:
                cursor = conn.execute('SELECT COUNT(*) FROM users')
                
                if cursor.fetchone()[0] == 0:
                    # Criar admin padrão
                    password_hash = self._hash_password('admin123')
                    
                    conn.execute('''
                        INSERT INTO users (username, password_hash, email, full_name, role)
                        VALUES (?, ?, ?, ?, ?)
                    ''', ('admin', password_hash, 'admin@bgp-failover.local', 'Administrator', 'admin'))
                    
                    conn.commit()
                    logger.info("Usuário admin padrão criado (senha: admin123)")
        
        except Exception as e:
            logger.error(f"Erro ao criar admin padrão: {e}")
    
    @staticmethod
    def _hash_password(password: str) -> str:
        """Hash de senha com salt"""
        salt = secrets.token_hex(16)
        pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return f"{salt}${pwd_hash.hex()}"
    
    @staticmethod
    def _verify_password(password: str, password_hash: str) -> bool:
        """Verifica senha contra hash"""
        try:
            salt, pwd_hash = password_hash.split('$')
            new_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
            return new_hash.hex() == pwd_hash
        except Exception:
            return False
    
    def create_user(self, username: str, password: str, email: str = None,
                   full_name: str = None, role: str = 'user') -> Tuple[bool, str]:
        """
        Cria novo usuário
        
        Args:
            username: Nome de usuário
            password: Senha
            email: Email (opcional)
            full_name: Nome completo (opcional)
            role: Papel do usuário (admin, user, viewer)
        
        Returns:
            Tupla (sucesso, mensagem)
        """
        try:
            password_hash = self._hash_password(password)
            
            with sqlite3.connect(self.db_file) as conn:
                conn.execute('''
                    INSERT INTO users (username, password_hash, email, full_name, role)
                    VALUES (?, ?, ?, ?, ?)
                ''', (username, password_hash, email, full_name, role))
                
                conn.commit()
            
            logger.info(f"Usuário criado: {username}")
            return True, f"Usuário '{username}' criado com sucesso"
        
        except sqlite3.IntegrityError:
            return False, f"Usuário '{username}' já existe"
        except Exception as e:
            logger.error(f"Erro ao criar usuário: {e}")
            return False, str(e)
    
    def authenticate(self, username: str, password: str,
                    ip_address: str = None, user_agent: str = None) -> Tuple[bool, Optional[str]]:
        """
        Autentica usuário e retorna JWT token
        
        Args:
            username: Nome de usuário
            password: Senha
            ip_address: IP do cliente (para auditoria)
            user_agent: User agent (para auditoria)
        
        Returns:
            Tupla (sucesso, token ou mensagem de erro)
        """
        try:
            with sqlite3.connect(self.db_file) as conn:
                cursor = conn.execute('''
                    SELECT id, password_hash, enabled FROM users WHERE username = ?
                ''', (username,))
                
                result = cursor.fetchone()
                
                if not result:
                    # Registrar tentativa falha
                    self._log_login_attempt(username, False, ip_address, user_agent)
                    return False, "Usuário ou senha inválidos"
                
                user_id, password_hash, enabled = result
                
                if not enabled:
                    self._log_login_attempt(username, False, ip_address, user_agent)
                    return False, "Usuário desabilitado"
                
                if not self._verify_password(password, password_hash):
                    self._log_login_attempt(username, False, ip_address, user_agent)
                    return False, "Usuário ou senha inválidos"
                
                # Gerar JWT token
                token = self._generate_token(user_id, username)
                
                # Atualizar último login
                conn.execute('''
                    UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
                ''', (user_id,))
                
                # Registrar tentativa bem-sucedida
                self._log_login_attempt(username, True, ip_address, user_agent)
                
                conn.commit()
                
                logger.info(f"Usuário autenticado: {username}")
                return True, token
        
        except Exception as e:
            logger.error(f"Erro ao autenticar: {e}")
            return False, str(e)
    
    def _generate_token(self, user_id: int, username: str, expires_in_hours: int = 24) -> str:
        """Gera JWT token"""
        payload = {
            'user_id': user_id,
            'username': username,
            'iat': datetime.utcnow(),
            'exp': datetime.utcnow() + timedelta(hours=expires_in_hours)
        }
        
        token = jwt.encode(payload, self.jwt_secret, algorithm='HS256')
        
        # Armazenar token no banco de dados
        with sqlite3.connect(self.db_file) as conn:
            conn.execute('''
                INSERT INTO tokens (user_id, token, expires_at)
                VALUES (?, ?, ?)
            ''', (user_id, token, payload['exp'].isoformat()))
            
            conn.commit()
        
        return token
    
    def verify_token(self, token: str) -> Tuple[bool, Optional[Dict]]:
        """
        Verifica JWT token
        
        Args:
            token: Token JWT
        
        Returns:
            Tupla (válido, dados do usuário ou None)
        """
        try:
            # Verificar se token foi revogado
            with sqlite3.connect(self.db_file) as conn:
                cursor = conn.execute('''
                    SELECT revoked FROM tokens WHERE token = ?
                ''', (token,))
                
                result = cursor.fetchone()
                
                if result and result[0]:
                    return False, None
            
            # Decodificar token
            payload = jwt.decode(token, self.jwt_secret, algorithms=['HS256'])
            
            return True, payload
        
        except jwt.ExpiredSignatureError:
            return False, None
        except jwt.InvalidTokenError:
            return False, None
        except Exception as e:
            logger.error(f"Erro ao verificar token: {e}")
            return False, None
    
    def _log_login_attempt(self, username: str, success: bool,
                          ip_address: str = None, user_agent: str = None):
        """Registra tentativa de login"""
        try:
            with sqlite3.connect(self.db_file) as conn:
                conn.execute('''
                    INSERT INTO login_audit (username, success, ip_address, user_agent)
                    VALUES (?, ?, ?, ?)
                ''', (username, success, ip_address, user_agent))
                
                conn.commit()
        except Exception as e:
            logger.error(f"Erro ao registrar login: {e}")
    
    def change_password(self, username: str, old_password: str,
                       new_password: str) -> Tuple[bool, str]:
        """
        Altera senha do usuário
        
        Args:
            username: Nome de usuário
            old_password: Senha antiga
            new_password: Senha nova
        
        Returns:
            Tupla (sucesso, mensagem)
        """
        try:
            with sqlite3.connect(self.db_file) as conn:
                cursor = conn.execute('''
                    SELECT id, password_hash FROM users WHERE username = ?
                ''', (username,))
                
                result = cursor.fetchone()
                
                if not result:
                    return False, "Usuário não encontrado"
                
                user_id, password_hash = result
                
                if not self._verify_password(old_password, password_hash):
                    return False, "Senha antiga incorreta"
                
                new_hash = self._hash_password(new_password)
                
                conn.execute('''
                    UPDATE users SET password_hash = ? WHERE id = ?
                ''', (new_hash, user_id))
                
                conn.commit()
            
            logger.info(f"Senha alterada: {username}")
            return True, "Senha alterada com sucesso"
        
        except Exception as e:
            logger.error(f"Erro ao alterar senha: {e}")
            return False, str(e)
    
    def list_users(self) -> List[Dict]:
        """Lista todos os usuários"""
        try:
            with sqlite3.connect(self.db_file) as conn:
                cursor = conn.execute('''
                    SELECT id, username, email, full_name, role, enabled, created_at, last_login
                    FROM users
                    ORDER BY created_at DESC
                ''')
                
                columns = [description[0] for description in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        except Exception as e:
            logger.error(f"Erro ao listar usuários: {e}")
            return []
    
    def get_login_audit(self, limit: int = 100) -> List[Dict]:
        """Obtém log de auditoria de login"""
        try:
            with sqlite3.connect(self.db_file) as conn:
                cursor = conn.execute('''
                    SELECT username, success, ip_address, user_agent, timestamp
                    FROM login_audit
                    ORDER BY timestamp DESC
                    LIMIT ?
                ''', (limit,))
                
                columns = [description[0] for description in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        except Exception as e:
            logger.error(f"Erro ao obter auditoria: {e}")
            return []


# Exemplo de uso
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    
    auth = AuthManager()
    
    # Criar usuário
    success, msg = auth.create_user('operador1', 'senha123', 'operador@example.com', 'Operador 1')
    print(f"Criar usuário: {msg}")
    
    # Autenticar
    success, token = auth.authenticate('operador1', 'senha123')
    if success:
        print(f"Token: {token[:50]}...")
        
        # Verificar token
        valid, payload = auth.verify_token(token)
        print(f"Token válido: {valid}")
        print(f"Payload: {payload}")
    else:
        print(f"Erro: {token}")
    
    # Listar usuários
    users = auth.list_users()
    print(f"\nUsuários: {len(users)}")
    for user in users:
        print(f"  - {user['username']} ({user['role']})")
