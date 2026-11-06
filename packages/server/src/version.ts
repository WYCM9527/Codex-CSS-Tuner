declare const __CSS_TUNER_VERSION__: string | undefined;

/** 构建时写进去；后台服务和 MCP 前端版本对不上时换掉旧的后台服务 */
export const VERSION: string = typeof __CSS_TUNER_VERSION__ === 'string' ? __CSS_TUNER_VERSION__ : '0.0.0-dev';
