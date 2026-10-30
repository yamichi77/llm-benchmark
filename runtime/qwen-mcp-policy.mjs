export const mcpServer='blender_benchmark';
export const mcpTools=Object.freeze(['execute_blender_code','get_objects_summary','get_object_detail_summary','search_api_docs','search_manual_docs','render_thumbnail_to_path']);
export const mcpPermissionRules=Object.freeze(mcpTools.map(tool=>'mcp__'+mcpServer+'__'+tool));
