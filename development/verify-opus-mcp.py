import asyncio, importlib.util, json, os, sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

root=Path(r'C:\Users\PUBLIC_USER\Desktop\Projects\model-benchmark')
work=Path(sys.argv[1])
work.mkdir(parents=True,exist_ok=False)
launcher=root/'runtime/integrations/blender/launch-opus.py'
spec=importlib.util.spec_from_file_location('benchmark_opus_tools',launcher)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
server=module.build_server()

async def main():
    names={t.name for t in await server.list_tools()}
    assert names==set(module.TOOLS)
    try:
        await server.call_tool('execute_blender_code_for_cli',{})
    except Exception as e:
        assert 'Unknown tool' in str(e) or 'not found' in str(e),str(e)
    else:
        raise AssertionError('Unlisted CLI execution tool was not rejected')
    params=StdioServerParameters(
        command=sys.executable,args=[str(launcher)],cwd=str(work),
        env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},
    )
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write) as session:
            init=await session.initialize()
            tools=await session.list_tools()
            actual={t.name for t in tools.tools}
            assert actual==names
            result=await session.call_tool('get_objects_summary',{})
            assert not result.isError
            text='\n'.join(c.text for c in result.content if hasattr(c,'text'))
            value=json.loads(text)
            if isinstance(value,dict) and 'status' in value:
                assert value['status']=='ok',value
            report={'server':init.serverInfo.model_dump(),'protocolVersion':init.protocolVersion,
                'tools':sorted(actual),'extraCliToolRejected':True,'readOnlySceneSummarySucceeded':True,
                'modelRequests':0,'assetGeneration':False,'originalCharacterLoaded':False,
                'dedicatedBlender':'factory-startup / disable-autoexec / offline-mode / 127.0.0.1:9877',
                'client':'MCP SDK ClientSession, not Claude model session'}
            (work/'compatibility.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(report,ensure_ascii=False))

asyncio.run(main())
