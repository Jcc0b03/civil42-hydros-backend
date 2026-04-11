const NAV_ITEMS = [
  { label: "Regional Intel", active: true },
  { label: "Logistics", active: false },
  { label: "Assets", active: false },
  { label: "Personnel", active: false },
];

export function TopNavBar() {
  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline bg-surface-variant px-8">
      <div className="flex items-center gap-8">
        <span className="font-headline text-lg font-bold uppercase tracking-tight text-primary-dark">
          Geospatial Command Authority
        </span>
        <nav className="hidden h-full items-center gap-6 pt-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href="#"
              className={
                item.active
                  ? "border-b-2 border-primary-dark pb-1 font-headline text-sm font-bold tracking-tight text-primary-dark"
                  : "rounded px-2 py-1 font-headline text-sm tracking-tight text-on-surface/70 transition-colors hover:bg-outline"
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center rounded border border-outline bg-white px-3 py-1.5 lg:flex">
          <span className="material-symbols-outlined mr-2 text-sm text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            placeholder="Szukaj sektorów..."
            className="w-48 border-none bg-transparent text-xs text-on-surface focus:outline-none focus:ring-0"
          />
        </div>
        <button
          type="button"
          className="material-symbols-outlined cursor-pointer text-on-surface-variant transition-colors hover:text-primary-dark active:scale-95"
        >
          notifications
        </button>
        <button
          type="button"
          className="material-symbols-outlined cursor-pointer text-on-surface-variant transition-colors hover:text-primary-dark active:scale-95"
        >
          settings
        </button>
        <div className="ml-2 h-8 w-8 overflow-hidden rounded-full border border-outline bg-surface-variant">
          <div className="flex h-full w-full items-center justify-center font-headline text-xs font-bold text-primary-dark">
            WS
          </div>
        </div>
      </div>
    </header>
  );
}
