import { ApplicationCommandOptionType } from "discord-api-types/v10";

/** Minimal shape shared by command and autocomplete options */
export interface OptionLike {
  name: string;
  type: ApplicationCommandOptionType;
  value?: unknown;
  focused?: boolean;
  options?: OptionLike[];
}

export function getSubcommand(
  options: readonly OptionLike[] | undefined,
): { name: string; options: OptionLike[] } | undefined {
  const sub = options?.find((o) => o.type === ApplicationCommandOptionType.Subcommand);
  return sub && { name: sub.name, options: sub.options ?? [] };
}

export function getStringOption(options: readonly OptionLike[], name: string): string | undefined {
  const value = options.find((o) => o.name === name)?.value;
  return value === undefined ? undefined : String(value);
}

export function getFocusedOption(options: readonly OptionLike[]): OptionLike | undefined {
  return options.find((o) => o.focused);
}
