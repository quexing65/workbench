import { businessDateOfEpochMilliseconds, DEFAULT_BUSINESS_TIME_ZONE } from '@workbench/shared';

/**
 * 服务端 `APP_TIME_ZONE` 的单值缓存。健康检查返回后写入，页面里的「今天」都应与
 * 服务端业务日一致；数据查询返回会让页面重渲染，届时即可读到正确时区。
 * 尚未就绪时退化为共享默认时区，与服务端默认值相同。
 */
let configuredTimeZone: string = DEFAULT_BUSINESS_TIME_ZONE;

export function setConfiguredTimeZone(timeZone: string): void {
  configuredTimeZone = timeZone;
}

export function getConfiguredTimeZone(): string {
  return configuredTimeZone;
}

/** 当前业务日（按服务端配置的时区）。 */
export function businessToday(): string {
  return businessDateOfEpochMilliseconds(Date.now(), configuredTimeZone);
}
