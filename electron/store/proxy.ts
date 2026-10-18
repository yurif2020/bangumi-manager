import { app, session } from 'electron';
import { readSettings } from './settings';
import type { ProxyMode } from '../shared/types';

export interface ProxyStatus {
  mode: string;
  rules: string;
}

/** 带 ECH 的 DoH 服务器：查询 type 65 即可拿到 CF 的通用 ECH 配置 */
const DOH_SERVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'];

/**
 * 应用代理模式。
 * - system：跟随系统代理（默认）
 * - direct：完全直连
 * - directPlus：直连 + DoH/ECH —— 对应 Total-ECH 的思路：
 *   用加密 DNS 拿 HTTPS 记录（含 ECH 配置），让 TLS 握手的 SNI 在支持的网络下被加密。
 *   仅在「目标站点走 Cloudflare CDN」且网络对 ECH 放行时有效，不代理流量。
 * - manual：自定义代理
 */
export async function applyProxy(): Promise<ProxyStatus> {
  const ses = session.defaultSession;
  const { proxyMode, proxyRules, directDns } = readSettings();
  try {
    if (proxyMode === 'manual' && proxyRules.trim()) {
      await ses.setProxy({ proxyRules: proxyRules.trim(), mode: 'fixed_servers' });
    } else if (proxyMode === 'direct' || proxyMode === 'directPlus') {
      await ses.setProxy({ mode: 'direct' });
    } else {
      await ses.setProxy({ mode: 'system' });
    }
  } catch {
    /* 代理设置失败不应阻塞应用 */
  }
  applyDns(proxyMode, directDns);
  const status = await ses.resolveProxy('https://api.bgm.tv').catch(() => 'UNKNOWN');
  return { mode: proxyMode, rules: proxyRules, ...{ resolved: status } } as ProxyStatus;
}

/**
 * DNS 解析策略。必须在 ready 之后调用。
 * 注意：走系统代理时不动 DNS，由代理自行解析，避免与代理的 DNS 冲突。
 */
function applyDns(mode: ProxyMode, directDns: boolean): void {
  try {
    if (mode === 'direct' && directDns) {
      app.configureHostResolver({
        enableBuiltInResolver: true,
        secureDnsMode: 'secure',
        secureDnsServers: DOH_SERVERS,
        // 放行 HTTPS(type 65) 查询，ECH 配置依赖它
        enableAdditionalDnsQueryTypes: true,
      });
    } else {
      // 恢复 Chromium 默认解析行为
      app.configureHostResolver({ secureDnsMode: 'automatic' });
    }
  } catch {
    /* 平台不支持时忽略 */
  }
}

export async function resolveProxySample(): Promise<string> {
  return session.defaultSession.resolveProxy('https://api.bgm.tv').catch(() => 'UNKNOWN');
}

/** 探测直连可用性：分别用直连与 DoH 各访问一次 Bangumi，返回耗时（毫秒） */
export async function probeDirect(): Promise<{ direct: number | null; doh: number | null }> {
  const run = async (doh: boolean) => {
    const started = Date.now();
    try {
      applyDns(doh ? 'directPlus' : 'direct', doh);
      await session.defaultSession.setProxy({ mode: 'direct' });
      const res = await session.defaultSession.fetch('https://api.bgm.tv/v0/subjects/2', {
        cache: 'no-store',
      });
      await res.arrayBuffer();
      return res.ok ? Date.now() - started : null;
    } catch {
      return null;
    } finally {
      await applyProxy();
    }
  };
  const direct = await run(false);
  const doh = await run(true);
  return { direct, doh };
}
