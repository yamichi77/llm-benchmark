// Official Qwen Code application setting, scoped to this benchmark's child process.
export const STREAM_MAX_LIFETIME_MS=0;
export function qwenEnvironment(parent){return {...parent,QWEN_STREAM_MAX_LIFETIME_MS:String(STREAM_MAX_LIFETIME_MS),QWEN_USAGE_STATISTICS_ENABLED:'false'};}
