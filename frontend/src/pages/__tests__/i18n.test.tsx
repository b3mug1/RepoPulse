import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { dict } from '../../translations';
import App from '../../App';
import * as client from '../../api/client';

describe('i18n Russian language support', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    vi.restoreAllMocks();
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    });
    document.documentElement.lang = 'en';
    vi.spyOn(client, 'getAllAnalysisHistory').mockResolvedValue({
      items: [],
      total: 0,
      limit: 4,
      offset: 0,
    });
    vi.spyOn(client, 'getExploreRepos').mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })
    );
  });

  it('has matching keys in en and ru dictionaries', () => {
    const enKeys = Object.keys(dict.en).sort();
    const ruKeys = Object.keys(dict.ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('switches UI to Russian when clicking the language switcher', async () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </LocaleProvider>
    );

    const switcher = screen.getByRole('button', { name: dict.en.switchLanguage });
    expect(switcher).toHaveTextContent('EN');
    expect(screen.getByText(dict.en.history)).toBeInTheDocument();

    fireEvent.click(switcher);

    expect(switcher).toHaveTextContent('RU');
    expect(document.documentElement.lang).toBe('ru');
    expect(store['repopulse_locale']).toBe('ru');
    expect(screen.getByText(dict.ru.history)).toBeInTheDocument();
    expect(screen.getByText(dict.ru.heroEyebrow)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(dict.ru.repoPlaceholder)).toBeInTheDocument();
  });
});
