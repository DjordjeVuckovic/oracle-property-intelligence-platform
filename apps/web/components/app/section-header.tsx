function SectionHeader({
  eyebrow,
  title,
  description,
  dark,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  dark?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <p className={`eyebrow ${dark ? "eyebrow-light" : "eyebrow-dark"}`}>{eyebrow}</p>
      ) : null}
      <h2 className={`mt-2 text-3xl md:text-4xl ${dark ? "text-white" : ""}`}>{title}</h2>
      {description ? (
        <p className={`mt-3 text-sm ${dark ? "text-white/72" : "text-muted-foreground"}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

export { SectionHeader };
