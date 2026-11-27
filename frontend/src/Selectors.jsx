import { useId, useState } from "react";
import { Popover } from "./overlays";
import Icon from "./Icon";
export function SearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [active, setActive] = useState(0);
  const id = useId();
  const rows = options.filter((o) =>
    `${o.label} ${o.detail || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = options.find((o) => o.value === value);
  function choose(option) {
    onChange(option.value);
    setOpen(false);
    setSearch("");
  }
  return (
    <label className="search-select-label">
      <span>{label}</span>
      <Popover
        label={label}
        open={open}
        onOpenChange={setOpen}
        className="search-select-popover"
        trigger={
          <button
            type="button"
            className="select-trigger"
            aria-label={label}
            aria-expanded={open}
          >
            <span>{selected?.label || placeholder}</span>
            <Icon name="chevron" />
          </button>
        }
      >
        <input
          aria-label={`Search ${label.toLowerCase()}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={rows[active] ? `${id}-${active}` : undefined}
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              const next =
                (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) %
                (rows.length || 1);
              setActive(next);
              document
                .getElementById(`${id}-${next}`)
                ?.scrollIntoView({ block: "nearest" });
            }
            if (e.key === "Enter" && rows[active]) {
              e.preventDefault();
              choose(rows[active]);
            }
          }}
          placeholder="Search…"
        />
        <div
          id={id}
          role="listbox"
          aria-label={label}
          className="select-options"
        >
          {rows.map((o, i) => (
            <button
              type="button"
              role="option"
              id={`${id}-${i}`}
              key={o.value}
              aria-selected={o.value === value}
              className={i === active ? "keyboard-active" : ""}
              onClick={() => choose(o)}
            >
              <strong>{o.label}</strong>
              {o.detail && <small>{o.detail}</small>}
            </button>
          ))}
          {!rows.length && <p className="muted">No matching options.</p>}
        </div>
      </Popover>
    </label>
  );
}
export function DatasetSelector({ datasets, value, onChange }) {
  return (
    <SearchSelect
      label="Dataset"
      value={value}
      onChange={onChange}
      placeholder="Select a ready dataset"
      options={datasets
        .filter((d) => !d.processing_status || d.processing_status === "Ready")
        .map((d) => ({
          value: d.dataset_id,
          label: d.name || "Imported transaction dataset",
          detail: `${d.basket_count.toLocaleString()} baskets · ${d.is_shared ? "Shared" : "Private"}`,
        }))}
    />
  );
}
