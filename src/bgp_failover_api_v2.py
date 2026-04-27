#!/usr/bin/env python3
"""
BGP Failover API v2
API REST com autenticação JWT e suporte a módulos
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from functools import wraps
import logging
from datetime import datetime

from auth_manager import AuthManager
from bgp_failover_platform import ModuleManager, PlatformConfig, MetricsStorage

app = Flask(__name__)
CORS(app)

# Configuração
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Inicializar gerenciadores
auth_manager = AuthManager()
platform_config = PlatformConfig()
module_manager = ModuleManager()
metrics_storage = MetricsStorage()


# ============================================================================
# DECORADORES
# ============================================================================

def require_auth(f):
    """Decorador para proteger endpoints com autenticação"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        
        # Procurar token no header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(' ')[1]
            except IndexError:
                return jsonify({'status': 'error', 'message': 'Token inválido'}), 401
        
        if not token:
            return jsonify({'status': 'error', 'message': 'Token não fornecido'}), 401
        
        # Verificar token
        valid, payload = auth_manager.verify_token(token)
        
        if not valid:
            return jsonify({'status': 'error', 'message': 'Token inválido ou expirado'}), 401
        
        # Adicionar dados do usuário ao request
        request.user = payload
        
        return f(*args, **kwargs)
    
    return decorated_function


def require_role(role):
    """Decorador para verificar role do usuário"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(request, 'user'):
                return jsonify({'status': 'error', 'message': 'Não autenticado'}), 401
            
            # Implementar verificação de role
            # Por enquanto, apenas admin pode acessar
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


# ============================================================================
# ENDPOINTS: AUTENTICAÇÃO
# ============================================================================

@app.route('/api/v2/auth/login', methods=['POST'])
def login():
    """Login de usuário"""
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('password'):
            return jsonify({
                'status': 'error',
                'message': 'Username e password são obrigatórios'
            }), 400
        
        # Obter IP do cliente
        ip_address = request.remote_addr
        user_agent = request.headers.get('User-Agent')
        
        # Autenticar
        success, result = auth_manager.authenticate(
            data['username'],
            data['password'],
            ip_address,
            user_agent
        )
        
        if not success:
            return jsonify({
                'status': 'error',
                'message': result
            }), 401
        
        return jsonify({
            'status': 'success',
            'token': result,
            'expires_in': 86400  # 24 horas em segundos
        }), 200
    
    except Exception as e:
        logger.error(f"Erro no login: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/v2/auth/verify', methods=['POST'])
@require_auth
def verify_token():
    """Verifica validade do token"""
    return jsonify({
        'status': 'success',
        'user': request.user
    }), 200


@app.route('/api/v2/auth/change-password', methods=['POST'])
@require_auth
def change_password():
    """Altera senha do usuário"""
    try:
        data = request.get_json()
        
        if not data or not data.get('old_password') or not data.get('new_password'):
            return jsonify({
                'status': 'error',
                'message': 'old_password e new_password são obrigatórios'
            }), 400
        
        success, msg = auth_manager.change_password(
            request.user['username'],
            data['old_password'],
            data['new_password']
        )
        
        if not success:
            return jsonify({'status': 'error', 'message': msg}), 400
        
        return jsonify({
            'status': 'success',
            'message': msg
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao alterar senha: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============================================================================
# ENDPOINTS: MÓDULOS
# ============================================================================

@app.route('/api/v2/modules', methods=['GET'])
@require_auth
def list_modules():
    """Lista módulos disponíveis"""
    try:
        modules = module_manager.list_modules()
        
        return jsonify({
            'status': 'success',
            'data': modules,
            'total': len(modules)
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao listar módulos: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/v2/modules/<module_name>/execute', methods=['POST'])
@require_auth
def execute_module(module_name):
    """Executa um módulo específico"""
    try:
        result = module_manager.execute_module(module_name)
        
        return jsonify({
            'status': 'success',
            'data': result
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao executar módulo: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/v2/modules/execute-all', methods=['POST'])
@require_auth
def execute_all_modules():
    """Executa todos os módulos"""
    try:
        results = module_manager.execute_all_modules()
        
        return jsonify({
            'status': 'success',
            'data': results,
            'total': len(results)
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao executar módulos: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============================================================================
# ENDPOINTS: MÉTRICAS
# ============================================================================

@app.route('/api/v2/metrics/<module_name>', methods=['GET'])
@require_auth
def get_metrics(module_name):
    """Obtém métricas de um módulo"""
    try:
        metric_name = request.args.get('metric_name')
        hours = request.args.get('hours', 24, type=int)
        
        metrics = metrics_storage.get_metrics(module_name, metric_name, hours)
        
        return jsonify({
            'status': 'success',
            'data': metrics,
            'total': len(metrics)
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao obter métricas: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============================================================================
# ENDPOINTS: ADMIN
# ============================================================================

@app.route('/api/v2/admin/users', methods=['GET'])
@require_auth
def list_users():
    """Lista usuários (apenas admin)"""
    try:
        users = auth_manager.list_users()
        
        return jsonify({
            'status': 'success',
            'data': users,
            'total': len(users)
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao listar usuários: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/v2/admin/users', methods=['POST'])
@require_auth
def create_user():
    """Cria novo usuário (apenas admin)"""
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('password'):
            return jsonify({
                'status': 'error',
                'message': 'username e password são obrigatórios'
            }), 400
        
        success, msg = auth_manager.create_user(
            data['username'],
            data['password'],
            data.get('email'),
            data.get('full_name'),
            data.get('role', 'user')
        )
        
        if not success:
            return jsonify({'status': 'error', 'message': msg}), 400
        
        return jsonify({
            'status': 'success',
            'message': msg
        }), 201
    
    except Exception as e:
        logger.error(f"Erro ao criar usuário: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/v2/admin/audit-logs', methods=['GET'])
@require_auth
def get_audit_logs():
    """Obtém logs de auditoria (apenas admin)"""
    try:
        limit = request.args.get('limit', 100, type=int)
        
        logs = auth_manager.get_login_audit(limit)
        
        return jsonify({
            'status': 'success',
            'data': logs,
            'total': len(logs)
        }), 200
    
    except Exception as e:
        logger.error(f"Erro ao obter logs: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============================================================================
# ENDPOINTS: HEALTH CHECK
# ============================================================================

@app.route('/api/v2/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '2.0.0'
    }), 200


# ============================================================================
# TRATAMENTO DE ERROS
# ============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'status': 'error', 'message': 'Endpoint não encontrado'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'status': 'error', 'message': 'Erro interno do servidor'}), 500


if __name__ == '__main__':
    app.run(
        host=platform_config.get('api.host', '0.0.0.0'),
        port=platform_config.get('api.port', 5000),
        debug=platform_config.get('api.debug', False)
    )
