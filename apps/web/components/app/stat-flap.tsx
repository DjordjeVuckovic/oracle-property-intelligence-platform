function StatFlap({ value, label }: { value: string; label?: string }) {
  return (
    <div>
      <div className="flex justify-center gap-1.5" role="img" aria-label={`${value}${label ? ` ${label}` : ""}`}>
        {value.split("").map((ch, i) => (
          <span
            key={i}
            aria-hidden
            className="relative flex h-16 w-11 items-center justify-center rounded-md bg-white font-display text-4xl text-primary shadow-sm md:h-20 md:w-14 md:text-5xl"
          >
            {ch}
            <span className="absolute left-0 top-1/2 h-px w-full bg-border" />
          </span>
        ))}
      </div>
      {label ? <p className="mt-4 text-center text-sm text-white/72">{label}</p> : null}
    </div>
  );
}

export { StatFlap };
