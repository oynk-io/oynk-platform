import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { countries, countryName, searchCountries } from "../lib/countries";

export type CountrySelectProps = {
  value: string | null;
  onChange: (iso2: string | null) => void;
  label: string;
  name: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  onBlur?: () => void;
};

export function CountrySelect({ value, onChange, label, name, error, disabled, required, placeholder = "Search countries", onBlur }: CountrySelectProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchCountries(query).slice(0, 80), [query]);

  useEffect(() => {
    function outside(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    }
    addEventListener("mousedown", outside);
    return () => removeEventListener("mousedown", outside);
  }, [onBlur]);

  useEffect(() => { if (open) requestAnimationFrame(() => searchRef.current?.focus()); }, [open]);

  function select(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(current + 1, results.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
    if (event.key === "Enter" && results[active]) { event.preventDefault(); select(results[active].code); }
  }

  return <div className={`country-field ${error ? "has-error" : ""}`} ref={root}>
    <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
    <div className="country-control">
      {value && !open ? <button ref={triggerRef} type="button" name={name} className="country-value" onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>
        <span>{countryName(value)} — {value}</span><ChevronDown aria-hidden="true" />
      </button> : <><Search aria-hidden="true" /><input ref={searchRef} id={id} name={name} value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onKeyDown={keyDown} disabled={disabled} placeholder={placeholder} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && results[active] ? `${id}-${results[active].code}` : undefined} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />{value ? <button type="button" className="country-clear" onClick={() => onChange(null)} aria-label={`Clear ${label}`}><X /></button> : null}</>}
    </div>
    {open ? <ul className="country-options" role="listbox" id={`${id}-list`}>{results.map((country, index) => <li id={`${id}-${country.code}`} key={country.code} role="option" aria-selected={value === country.code} className={index === active ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => select(country.code)}><span>{country.name}</span><small>{country.code}</small>{value === country.code ? <Check /> : null}</li>)}{results.length === 0 ? <li className="empty">No countries match your search.</li> : null}</ul> : null}
    {error ? <small className="field-error" id={`${id}-error`}>{error}</small> : null}
  </div>;
}

export function CountryMultiSelect({ values, onChange, label, name, error }: { values: readonly string[]; onChange: (values: string[]) => void; label: string; name: string; error?: string }) {
  const [query, setQuery] = useState("");
  const available = searchCountries(query).filter((country) => !values.includes(country.code)).slice(0, 8);
  return <div className="country-multi"><label>{label}</label><input type="hidden" name={name} value={values.join(",")} /><div className="country-chips">{values.map((code) => <span key={code}>{countryName(code)}<button type="button" onClick={() => onChange(values.filter((value) => value !== code))} aria-label={`Remove ${countryName(code)}`}><X /></button></span>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search and add countries" aria-invalid={error ? true : undefined} />{query ? <ul>{available.map((country) => <li key={country.code}><button type="button" onClick={() => { onChange([...values, country.code]); setQuery(""); }}>{country.name} — {country.code}</button></li>)}</ul> : null}{error ? <small className="field-error">{error}</small> : null}</div>;
}

export { countries };
