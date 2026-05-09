export interface AppBrandingSettings {
  appName: string;
  logoLightDataUrl: string;
  logoDarkDataUrl: string;
}

const APP_BRANDING_STORAGE_KEY = 'trackit:app-branding:v1';
export const APP_BRANDING_UPDATED_EVENT = 'trackit:app-branding-updated';

const DEFAULT_BRANDING: AppBrandingSettings = {
  appName: 'TEd_trackIT',
  logoLightDataUrl: '',
  logoDarkDataUrl: '',
};

export function loadAppBranding(): AppBrandingSettings {
  try {
    const raw = window.localStorage.getItem(APP_BRANDING_STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    const parsed = JSON.parse(raw) as Partial<AppBrandingSettings>;
    return {
      appName: (parsed.appName || DEFAULT_BRANDING.appName).trim() || DEFAULT_BRANDING.appName,
      logoLightDataUrl: parsed.logoLightDataUrl || '',
      logoDarkDataUrl: parsed.logoDarkDataUrl || '',
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function saveAppBranding(next: AppBrandingSettings): void {
  window.localStorage.setItem(APP_BRANDING_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(APP_BRANDING_UPDATED_EVENT));
}

export function resolveBrandLogoForTheme(branding: AppBrandingSettings): string {
  const isDarkMode =
    document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (isDarkMode && branding.logoDarkDataUrl) return branding.logoDarkDataUrl;
  if (!isDarkMode && branding.logoLightDataUrl) return branding.logoLightDataUrl;
  return branding.logoLightDataUrl || branding.logoDarkDataUrl || '';
}

