type Props = {
  onClose: () => void;
};

export function AssetDetailPanel({ onClose }: Props) {
  return (
    <div className="flex h-fit flex-col overflow-hidden rounded border border-l-4 border-outline border-l-critical bg-white shadow-xl">
      <div className="border-b border-outline bg-surface-variant/30 p-6">
        <div className="mb-1 flex items-start justify-between">
          <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-critical">
            Aktywny zasób wybrany
          </span>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined text-on-surface-variant hover:text-critical"
          >
            close
          </button>
        </div>
        <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">
          Szpital Powiatowy w Puławach
        </h1>
        <p className="mt-1 font-headline text-xs text-on-surface-variant">
          Sektor: 4-Alpha | Współrzędne: 51.41°N, 21.97°E
        </p>
      </div>

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded border border-critical/20 bg-critical/5 p-3">
            <span className="mb-1 block font-headline text-[9px] font-bold uppercase text-critical">
              Status
            </span>
            <div className="flex items-center gap-1.5 font-headline text-[11px] font-bold uppercase leading-tight text-critical">
              <span className="material-symbols-outlined text-sm">flood</span>
              KRYTYCZNY - RYZYKO POWODZIOWE
            </div>
          </div>
          <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3">
            <span className="mb-1 block font-headline text-[9px] font-bold uppercase text-amber-600">
              Infrastruktura
            </span>
            <div className="flex items-center gap-1.5 font-headline text-[11px] font-bold uppercase leading-tight text-amber-700">
              <span className="material-symbols-outlined text-sm">
                emergency_home
              </span>
              AGREGAT: 4h paliwa
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-headline text-[11px] font-bold uppercase tracking-wider text-primary-dark">
            Macierz zasobów (live)
          </h3>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex justify-between font-headline text-xs">
                <span className="text-on-surface-variant">
                  Łóżka (OIOM)
                </span>
                <span className="font-bold">180 / 200</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-outline">
                <div className="h-full bg-primary" style={{ width: "90%" }} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between font-headline text-xs">
                <span className="text-on-surface-variant">Status SOR</span>
                <span className="font-bold uppercase text-critical">
                  ODMAWIA PRZYJĘĆ
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-critical/10">
                <div className="h-full bg-critical" style={{ width: "100%" }} />
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded border border-primary/20 bg-primary/5 p-4">
          <span className="mb-2 block font-headline text-[10px] font-bold uppercase tracking-widest text-primary-dark">
            Rekomendacja Sentinel AI
          </span>
          <p className="font-headline text-sm italic leading-relaxed text-on-surface">
            &quot;Ewakuacja OIOM wymagana. Potencjalne przerwanie wału w 120 min.
            Przekieruj zasoby do Lublin Centralny. Trasa bezpieczna: Route 801
            (szacowany czas tranzytu 45 min).&quot;
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded bg-critical py-3 font-headline text-xs font-bold uppercase tracking-widest text-white transition-all hover:opacity-90"
          >
            <span className="material-symbols-outlined text-sm">
              emergency_share
            </span>
            Zarządź ewakuację
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded border border-outline bg-surface-variant py-3 font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface transition-all hover:bg-outline"
            >
              <span className="material-symbols-outlined text-sm text-primary-dark">
                water_pump
              </span>
              Pompy
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded border border-outline bg-surface-variant py-3 font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface transition-all hover:bg-outline"
            >
              <span className="material-symbols-outlined text-sm text-amber-600">
                alt_route
              </span>
              Przekieruj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
