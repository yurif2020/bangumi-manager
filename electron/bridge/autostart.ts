import { app } from 'electron';

/** 开机自启：Windows/macOS 走登录项，Linux 交给打包器处理 */
export function applyLaunchAtLogin(enabled: boolean): void {
  try {
    if (process.platform === 'linux') return;
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
      args: ['--hidden'],
    });
  } catch {
    /* 某些受管环境不允许修改登录项 */
  }
}

export function isLaunchAtLogin(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}
