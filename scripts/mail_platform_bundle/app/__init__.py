import os
from flask import Flask, request, jsonify, send_from_directory
from app.config.settings import config
from app.database import init_security_tables
from app.logging.structured_logger import structured_logger
from app.api.health_bp import health_bp
from app.api.auth_bp import auth_bp
from app.api.domains_bp import domains_bp
from app.api.mailboxes_bp import mailboxes_bp
from app.api.aliases_bp import aliases_bp
from app.api.apps_bp import apps_bp
from app.api.ops_monitoring_bp import ops_bp
from app.api.webmail_bp import webmail_bp
from app.api.client_config_bp import client_config_bp
from app.api.queue_ops_bp import queue_bp
from app.api.security_bp import security_bp
from app.api.native_mail_bp import native_mail_bp

def create_app():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_dist = os.path.join(base_dir, "frontend", "dist")
    dist_dir = frontend_dist if os.path.isdir(frontend_dist) else os.path.join(base_dir, "dist")
    
    app = Flask(__name__, static_folder=dist_dir)
    
    # Initialize Structured Logger
    structured_logger.init_app(app)

    # Initialize DB security tables
    init_security_tables()

    # Register API Blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(domains_bp)
    app.register_blueprint(mailboxes_bp)
    app.register_blueprint(aliases_bp)
    app.register_blueprint(apps_bp)
    app.register_blueprint(ops_bp)
    app.register_blueprint(webmail_bp)
    app.register_blueprint(client_config_bp)
    app.register_blueprint(queue_bp)
    app.register_blueprint(security_bp)
    app.register_blueprint(native_mail_bp)

    # Register v1 alias routes dynamically
    for rule in list(app.url_map.iter_rules()):
        if rule.rule.startswith("/api/") and not rule.rule.startswith("/api/v1/"):
            v1_rule = rule.rule.replace("/api/", "/api/v1/", 1)
            app.add_url_rule(
                v1_rule,
                endpoint=f"{rule.endpoint}_v1_alias",
                view_func=app.view_functions[rule.endpoint],
                methods=rule.methods
            )

    # Security Headers Hook
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response

    # SPA & Static Asset Serving
    @app.route("/assets/<path:filename>")
    def serve_assets(filename):
        assets_dir = os.path.join(app.static_folder, "assets")
        return send_from_directory(assets_dir, filename)

    @app.route("/<path:filename>")
    def serve_static_or_spa(filename):
        file_path = os.path.join(app.static_folder, filename)
        if os.path.isfile(file_path):
            return send_from_directory(app.static_folder, filename)
        if request.path.startswith("/api/"):
            return jsonify({
                "status": "error",
                "success": False,
                "message": f"API route '{request.path}' not found",
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"API route '{request.path}' not found"
                }
            }), 404
        return send_from_directory(app.static_folder, "index.html")

    @app.route("/")
    def serve_root():
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(404)
    def handle_spa_or_api_404(e):
        if request.path.startswith("/api/"):
            return jsonify({
                "status": "error",
                "success": False,
                "message": f"API route '{request.path}' not found",
                "error": {
                    "code": "NOT_FOUND",
                    "message": f"API route '{request.path}' not found"
                }
            }), 404
        return send_from_directory(app.static_folder, "index.html")

    return app
