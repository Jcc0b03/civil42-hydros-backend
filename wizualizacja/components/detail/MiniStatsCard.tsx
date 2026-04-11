type Props = {
  value: string;
  label: string;
  caption: string;
};

export function MiniStatsCard({ value, label, caption }: Props) {
  return (
    <div className="flex items-center gap-4 rounded border border-outline bg-white p-4 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
        <span className="font-headline text-xl font-bold text-primary-dark">
          {value}
        </span>
      </div>
      <div>
        <h4 className="font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {label}
        </h4>
        <p className="font-headline text-sm font-bold text-on-surface">
          {caption}
        </p>
      </div>
    </div>
  );
}
