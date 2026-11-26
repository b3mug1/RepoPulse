import { useState } from 'react';

export type Locale = 'en' | 'ru';

const LOCALE_KEY = 'repopulse_locale';

const dict = {
  en: {
    history: 'History',
    compare: 'Compare',
    watchlist: 'Watchlist',
    openSource: 'Open source',
    systemsOk: 'Systems operational',
    systemsDegraded: 'Systems degraded',
    systemsChecking: 'Checking systems',
    skipToContent: 'Skip to main content',
  },
  ru: {
    history: 'История',
    compare: 'Сравнение',
    watchlist: 'Мониторинг',
    openSource: 'Открытый код',
    systemsOk: 'Системы работают',
    systemsDegraded: 'Сбой сервисов',
    systemsChecking: 'Проверка сервисов',
    skipToContent: 'Перейти к основному содержимому',
  },
} as const;

export function useLocale() {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem(LOCALE_KEY);
      return saved === 'ru' ? 'ru' : 'en';
    } catch {
      return 'en';
    }
  });

  const toggleLocale = () => {
    const next: Locale = locale === 'en' ? 'ru' : 'en';
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  return { locale, toggleLocale, t: dict[locale] };
}
