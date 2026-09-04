"use client";

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = e.target.value;
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <div className="w-full">
      <select
        value={locale}
        onChange={handleLanguageChange}
        className="w-full rounded-md bg-white/10 text-white border-white/20 text-[12px] py-1 px-2 outline-none cursor-pointer hover:bg-white/20 transition-colors"
      >
        <option value="en" className="text-black">English</option>
        <option value="fr" className="text-black">Français</option>
        <option value="pt" className="text-black">Português</option>
        <option value="es" className="text-black">Español</option>
        <option value="ar" className="text-black">العربية</option>
      </select>
    </div>
  );
}
