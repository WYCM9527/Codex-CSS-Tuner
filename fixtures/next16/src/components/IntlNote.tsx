import { getTranslations } from 'next-intl/server';

/** next-intl 的文字样例：服务端组件里用 getTranslations 取的消息 */
export async function IntlNote() {
  const t = await getTranslations('home');
  return (
    <section className="mt-6 space-y-2" data-testid="intl">
      <h2 className="text-lg font-semibold" data-testid="intl-title">
        {t('title')}
      </h2>
      <p className="text-sm" data-testid="intl-body">
        {t('body')}
      </p>
    </section>
  );
}
