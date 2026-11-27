import Icon from "./Icon";

export default function HelpTip({ label, children }) {
  return (
    <span className="help-tip">
      <button type="button" className="help-tip-trigger" aria-label={`Help: ${label}`}>
        <Icon name="info" />
      </button>
      <span className="help-tip-content" role="tooltip">{children}</span>
    </span>
  );
}
