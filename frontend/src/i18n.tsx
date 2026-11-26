import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dict, Locale } from './translations';

export type { Locale };

const LOCALE_KEY = 'repopulse_locale';

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    return saved === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

interface LocaleContextValue {
  locale: Locale;
  dateLocale: string;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (typeof dict)[Locale];
}

const defaultLocale = getInitialLocale();

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  dateLocale: defaultLocale === 'ru' ? 'ru-RU' : 'en-US',
  setLocale: () => {},
  toggleLocale: () => {},
  t: dict[defaultLocale],
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next: Locale = prev === 'en' ? 'ru' : 'en';
      try {
        localStorage.setItem(LOCALE_KEY, next);
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dateLocale: locale === 'ru' ? 'ru-RU' : 'en-US',
      setLocale,
      toggleLocale,
      t: dict[locale],
    }),
    [locale, setLocale, toggleLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
