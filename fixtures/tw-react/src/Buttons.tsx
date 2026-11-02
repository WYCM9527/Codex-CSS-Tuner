import { Button } from './ui/Button';

export function Buttons() {
  return (
    <div className="mx-auto mt-6 flex max-w-3xl gap-3 px-6" data-testid="buttons">
      <Button data-testid="btn-save">保存</Button>
      <Button className="w-40" data-testid="btn-wide">
        加宽
      </Button>
      <Button variant="outline" size="sm" data-testid="btn-small">
        小号
      </Button>
    </div>
  );
}
