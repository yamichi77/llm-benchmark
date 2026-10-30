"""Trial-only composition of installed Blender Lab tools; global install unchanged."""
import asyncio
import importlib
import json, os
from pathlib import Path
import runpy
import blmcp
import yaml
from mcp.server.fastmcp import FastMCP

TOOLS = (
    'execute_blender_code', 'get_objects_summary', 'get_object_detail_summary',
    'search_api_docs', 'search_manual_docs', 'render_thumbnail_to_path',
)

def build_server():
    with (Path(blmcp.__file__).parent / 'data' / 'prompts.yml').open(encoding='utf-8') as f:
        instructions = str(yaml.safe_load(f)['initial_instructions'])
    server = FastMCP('blender-mcp', instructions=instructions)
    for name in TOOLS:
        importlib.import_module('blmcp.tools.' + name).register(server)
    # The execute module also registers a CLI execution tool; do not expose it.
    for tool in asyncio.run(server.list_tools()):
        if tool.name not in TOOLS:
            server.remove_tool(tool.name)
    if {t.name for t in asyncio.run(server.list_tools())} != set(TOOLS):
        raise RuntimeError('Installed Blender MCP tool set differs from benchmark')
    return server

def limited_main():
    build_server().run(transport='stdio')
    return 0

if __name__ == '__main__':
    # Reuse the existing dedicated offline Blender lifecycle; no new listener policy.
    work = os.environ.get('MODEL_BENCHMARK_WORKDIR')
    if work:
        os.chdir(Path(work).resolve(strict=True))
    blmcp.main = limited_main
    runpy.run_path(str(Path(__file__).with_name('launch.py')), run_name='__main__')
