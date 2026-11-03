import { useTranslation } from 'react-i18next';
import { Card } from './Card';

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded bg-ink/10 px-2 py-0.5 text-xs" data-testid="badge">
      {label}
    </span>
  );
}

/** 文字编辑的样例：多语言、被行内标签隔开的文字、动态文字、调用处传进来的字符串 */
export function Texts() {
  const { t } = useTranslation();
  const count = 3;
  return (
    <section className="mx-auto mt-8 max-w-3xl space-y-3 px-gutter" data-testid="texts">
      <h2 className="text-lg font-semibold" data-testid="i18n-title">
        {t('texts.title')}
      </h2>
      <p className="text-sm" data-testid="inline">
        行内标签前面的文字 <b>加粗</b> 和后面的文字
      </p>
      <p className="text-sm" data-testid="dynamic">
        {count} 个条目
      </p>
      <Badge label="调用处的字符串" />
      <Card title={t('texts.cardTitle')}>{t('texts.cardBody')}</Card>
    </section>
  );
}
