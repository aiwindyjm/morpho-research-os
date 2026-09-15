import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Globe, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Popover } from "@morpho/ui";
import { LANGUAGES } from "@/i18n";
import { useLanguageStore } from "@/stores/languageStore";
import { THEME_IDS, useThemeStore } from "@/stores/themeStore";
import { THEME_PREVIEW_COLORS } from "@/components/themePreviewColors";

/**
 * Topbar quick menus (I3): an explicit language switcher and a discoverable
 * skin switcher, both anchored in the topbar's top-right cluster — the
 * full-control surfaces (settings cards) stay unchanged.
 *
 * A11y conventions, matching the registered primitives and the
 * ProjectSwitcher precedent:
 *  - The Popover primitive owns the menu-button shell: non-modal panel
 *    (role=dialog, aria-modal=false), `aria-expanded` + `aria-haspopup` on
 *    the trigger, Escape and outside clicks close it, focus stays with the
 *    trigger.
 *  - Option rows reuse the ProjectSwitcher listbox pattern: role=listbox on
 *    the panel list + role=option + aria-selected per row + a Check glyph on
 *    the active row (chosen over role=menu/menuitemradio because it is the
 *    popover convention this codebase already ships and tests).
 *  - Selecting applies instantly through the language/theme stores, then
 *    closes the panel. The Popover primitive is uncontrolled (its open state
 *    has no external setter), so closing is done by remounting it (key=epoch
 *    bump); an effect then returns focus to the fresh trigger — the
 *    menu-button pattern "activate item → close menu → focus the opener".
 */

interface QuickMenuProps {
  testId: string;
  /** Accessible name + tooltip of the trigger button. */
  triggerLabel: string;
  triggerIcon: ReactNode;
  /** Compact trailing text (language self-code); omit for an icon-only trigger. */
  triggerText?: string;
  /** Accessible name of the option list. */
  listLabel: string;
  children: (close: () => void) => ReactNode;
}

function QuickMenu({
  testId,
  triggerLabel,
  triggerIcon,
  triggerText,
  listLabel,
  children,
}: QuickMenuProps) {
  const [epoch, setEpoch] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  // After a selection remounts the Popover, put focus back on the fresh
  // trigger node (menu-button pattern).
  useEffect(() => {
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [epoch]);

  /** Applies the caller's selection, closes the panel, restores trigger focus. */
  function closeAfterSelection() {
    restoreFocusRef.current = true;
    setEpoch((value) => value + 1);
  }

  return (
    <Popover
      key={epoch}
      align="end"
      trigger={({ onClick, "aria-expanded": expanded }) => (
        <Button
          ref={triggerRef}
          variant="ghost"
          size={triggerText ? "sm" : "icon"}
          onClick={onClick}
          aria-expanded={expanded}
          aria-haspopup="dialog"
          aria-label={triggerLabel}
          title={triggerLabel}
          data-testid={testId}
          className={
            triggerText
              ? undefined
              : "rounded-full! border-border! text-caption"
          }
        >
          {triggerIcon}
          {triggerText ? (
            <span aria-hidden="true" className="text-caption font-semibold">
              {triggerText}
            </span>
          ) : null}
        </Button>
      )}
    >
      <div
        role="listbox"
        aria-label={listLabel}
        data-testid={`${testId}-list`}
        className="flex min-w-56 flex-col gap-xs"
      >
        {children(closeAfterSelection)}
      </div>
    </Popover>
  );
}

/** One menu row: optional preview swatch + label + Check on the active row
 * (same faces as the ProjectSwitcher rows). */
function QuickMenuOption({
  testId,
  active,
  label,
  onSelect,
  swatch,
}: {
  testId: string;
  active: boolean;
  label: string;
  onSelect: () => void;
  swatch?: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      role="option"
      aria-selected={active}
      data-testid={testId}
      onClick={onSelect}
      className={`h-auto w-full justify-start gap-sm border-0 px-sm! py-xs text-left ${
        active ? "bg-accent-soft!" : "hover:bg-accent-soft!"
      }`}
    >
      {swatch}
      <span className="min-w-0 flex-1 truncate text-caption font-semibold text-text-primary">
        {label}
      </span>
      {active ? (
        <span aria-hidden="true" className="flex text-info">
          <Check size={16} strokeWidth={1.75} />
        </span>
      ) : null}
    </Button>
  );
}

/**
 * 语言菜单: trigger = Globe + the current language's compact self-code
 * ("中文" / "EN" / …, from LANGUAGES.shortLabel); panel = the ten registered
 * languages by locale-invariant native self-name. Selecting applies through
 * the language store (i18n instance + <html lang> + localStorage in
 * lockstep).
 */
export function LanguageMenu() {
  const { t } = useTranslation("shell");
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const current = LANGUAGES.find((l) => l.id === language) ?? LANGUAGES[0];

  return (
    <QuickMenu
      testId="topbar-language-menu"
      triggerLabel={t("languageMenu")}
      triggerIcon={<Globe size={16} strokeWidth={1.75} aria-hidden="true" />}
      triggerText={current.shortLabel}
      listLabel={t("languageList")}
    >
      {(close) => (
        <>
          {LANGUAGES.map((l) => (
            <QuickMenuOption
              key={l.id}
              testId={`topbar-language-option-${l.id}`}
              active={l.id === language}
              label={l.nativeName}
              onSelect={() => {
                setLanguage(l.id);
                close();
              }}
            />
          ))}
        </>
      )}
    </QuickMenu>
  );
}

/**
 * 皮肤菜单: trigger = Palette (icon-only, circular like the help/avatar
 * buttons); panel = the two ADR-022 skins with their fixed-palette three-dot
 * preview swatch and localized name (settings:theme.<id>.name). Selecting
 * applies through the theme store (dataset.theme + localStorage).
 */
export function SkinMenu() {
  const { t } = useTranslation("shell");
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <QuickMenu
      testId="topbar-skin-menu"
      triggerLabel={t("skinMenu")}
      triggerIcon={<Palette size={16} strokeWidth={1.75} aria-hidden="true" />}
      listLabel={t("skinList")}
    >
      {(close) => (
        <>
          {THEME_IDS.map((id) => (
            <QuickMenuOption
              key={id}
              testId={`topbar-skin-option-${id}`}
              active={id === theme}
              label={t(`settings:theme.${id}.name`)}
              swatch={
                <span
                  aria-hidden="true"
                  title={t("settings:theme.swatchTitle")}
                  className="flex flex-col justify-center gap-[2px]"
                >
                  {THEME_PREVIEW_COLORS[id].map((hex) => (
                    <span
                      key={hex}
                      className="size-2 rounded-full border border-border"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </span>
              }
              onSelect={() => {
                setTheme(id);
                close();
              }}
            />
          ))}
        </>
      )}
    </QuickMenu>
  );
}
