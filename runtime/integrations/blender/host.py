import sys, os
sys.path.insert(0,r'C:/Users/PUBLIC_USER/Desktop/ツール/charakuru-1.0.3/local/blender_mcp/addon')
import blender_mcp_addon
blender_mcp_addon.register()
from blender_mcp_addon import cli
port=int(os.environ.get('BLENDER_MCP_PORT','9877'))
if port not in (9877,9878):
    raise RuntimeError('Unsupported benchmark Blender port')
raise SystemExit(cli.cli_execute(['--host','127.0.0.1','--port',str(port)]))
