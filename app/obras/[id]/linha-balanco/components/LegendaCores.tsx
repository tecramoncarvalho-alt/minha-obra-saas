interface Props {
  coresCache: Record<string, string>;
}

export function LegendaCores({ coresCache }: Props) {
  if (Object.keys(coresCache).length === 0) return null;
  return (
    <div className="mt-4 bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
      <span className="text-sm font-semibold text-slate-700 mr-2">🎨 Legenda:</span>
      {Object.entries(coresCache).map(([nome, cor]) => (
        <div key={nome} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: cor }}></div>
          <span className="text-xs text-slate-700">{nome}</span>
        </div>
      ))}
    </div>
  );
}
