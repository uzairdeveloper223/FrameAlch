#!/usr/bin/env python3
import os
import sys
import argparse
import subprocess
import http.server
import socketserver

def check_and_clone_luts():
    lut_dir = os.path.join(os.path.dirname(__file__), 'resources', 'Film-Luts')
    if not os.path.exists(lut_dir):
        print("\033[94m[Info] LUTs directory not found. Cloning YahiaAngelo/Film-Luts repository...\033[0m")
        try:
            os.makedirs(os.path.dirname(lut_dir), exist_ok=True)
            subprocess.run([
                "git", "clone", 
                "https://github.com/YahiaAngelo/Film-Luts.git", 
                lut_dir
            ], check=True)
            print("\033[92m[Success] Cloned LUTs repository successfully!\033[0m")
        except Exception as e:
            print(f"\033[91m[Error] Failed to clone LUTs repository: {e}\033[0m")
            sys.exit(1)
    else:
        print("\033[92m[Info] LUTs directory already present locally.\033[0m")

def update_production_flag(is_prod):
    app_js_path = os.path.join(os.path.dirname(__file__), 'js', 'app.js')
    if not os.path.exists(app_js_path):
        print(f"\033[91m[Error] app.js not found at {app_js_path}\033[0m")
        sys.exit(1)
        
    try:
        with open(app_js_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        updated = False
        for i, line in enumerate(lines):
            if line.startswith('const IS_PRODUCTION ='):
                target = f"const IS_PRODUCTION = {'true' if is_prod else 'false'};\n"
                if lines[i] != target:
                    lines[i] = target
                    updated = True
                break
                
        if updated:
            with open(app_js_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            print(f"\033[93m[Config] Set IS_PRODUCTION to {'true' if is_prod else 'false'} in app.js\033[0m")
        else:
            print(f"\033[92m[Config] IS_PRODUCTION is already {'true' if is_prod else 'false'} in app.js\033[0m")
    except Exception as e:
        print(f"\033[91m[Error] Failed to update config in app.js: {e}\033[0m")
        sys.exit(1)

def run_server(port):
    handler = http.server.SimpleHTTPRequestHandler
    
    # Enable CORS for convenience
    class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            super().end_headers()
            
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", port), CORSHTTPRequestHandler) as httpd:
            print(f"\033[95m\n=======================================================")
            print(f" 🌟 FrameAlch Dev Server running at: http://localhost:{port}")
            print(f"=======================================================\033[0m")
            print("Press Ctrl+C to stop the server.\n")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\033[93m[Info] Server stopped by user.\033[0m")
        sys.exit(0)
    except Exception as e:
        print(f"\033[91m[Error] Failed to start server: {e}\033[0m")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="FrameAlch Dev & Deployment Server Script")
    parser.add_argument('--prod', action='store_true', help="Set IS_PRODUCTION = true for static cloud deployment")
    parser.add_argument('--local', action='store_true', help="Set IS_PRODUCTION = false, clone assets locally, and serve")
    parser.add_argument('--port', type=int, default=8080, help="Port to serve on locally (default: 8080)")
    
    args = parser.parse_args()
    
    # If both are omitted, we default to local dev server
    is_prod = args.prod and not args.local
    
    if is_prod:
        update_production_flag(True)
        print("\033[92m[Success] Ready for static production hosting! app.js is now pulling LUTs from YahiaAngelo/Film-Luts GitHub Raw content.\033[0m")
    else:
        check_and_clone_luts()
        update_production_flag(False)
        run_server(args.port)

if __name__ == '__main__':
    main()
