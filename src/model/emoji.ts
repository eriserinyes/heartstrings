/**
 * Emoji palettes for the pickers, grouped into tabs. Any emoji can still be
 * typed or pasted into the picker's free-text box; these are just the
 * curated, one-tap options. Kept to emoji that render on current Windows,
 * macOS, iOS and Android (no country flags, which Windows draws as letters).
 */

export interface EmojiGroup {
  label: string;
  icon: string;
  emoji: string[];
}

const split = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment).filter((x) => x.trim());

export const PERSON_EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: 'Animals',
    icon: '🦊',
    emoji: split(
      '🦊🐰🐸🐱🐶🐻🐼🐨🐯🦁🐮🐷🐭🐹🦄🐴🦓🦒🐘🦔🦦🦥🦨🦡🐿️🦇🐺🐵🐔🐧🐦🐤🦆🦉🦜🦩🦚🕊️🐢🐍🦎🦖🐉🐙🦑🦀🐠🐡🐬🐳🦈🦭🐝🦋🐞🐌🐛🕷️🐾',
    ),
  },
  {
    label: 'Nature',
    icon: '🌸',
    emoji: split('🌸🌺🌻🌹🌷💐🌼🪷🪻🌿🍀🌱🌵🌴🌲🍄🍁🍂🪴🌙🌛⭐🌟☀️🌈☁️⛅❄️☃️🔥🌊💧⚡🪐🌍🌋🏔️🌌🌠'),
  },
  {
    label: 'Food',
    icon: '🍓',
    emoji: split('🍓🍒🍑🍋🍊🍉🍇🍍🥭🥝🍎🍐🫐🥥🥑🌶️🥕🌽🍕🍔🌮🍣🍜🍙🥟🍩🍪🧁🎂🍰🍫🍬🍭🍮🍯🧋☕🍵🍷🍸🍹🧃🥐🥨🧀🍿🥞'),
  },
  {
    label: 'Faces & folks',
    icon: '😊',
    emoji: split(
      '😀😊😇🥰😍😘😎🤓🥳🤩😏😴🤠🥸🤗🙃🫠😈👻👽👾🤖💀🎃😺😻😼🙀👑💅🧚🧜🧝🧙🧛🧞🦸🦹🥷👸🤴🧑‍🎤🧑‍🎨🧑‍🚀🧑‍🍳🧑‍💻🧑‍🔬🧑‍🌾',
    ),
  },
  {
    label: 'Things & hobbies',
    icon: '🎀',
    emoji: split('🔮✨🎀💎🗝️🪄🎸🎻🥁🎹🎨🖌️🎮🕹️🎲♟️🧩📚✏️🎧🎤🎭🩰⚽🏀🎾🛹🛼🚲🚀🛸⛵🎈🎁🧸🪁🕯️💡📷🪩🌂👠👒🧶🪡🎬🏳️‍🌈🏳️‍⚧️'),
  },
  {
    label: 'Hearts & symbols',
    icon: '💜',
    emoji: split('❤️🧡💛💚💙💜🩷🩵🤍🩶🖤🤎💖💗💓💞💕💘💝❣️♾️☯️☮️⚧️⚛️♈♉♊♋♌♍♎♏♐♑♒♓💫🌀🎵🎶'),
  },
];

export const TYPE_EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: 'Love',
    icon: '💖',
    emoji: split('💖💗💓💞💕💘💝❤️🧡💛💚💙💜🩷🩵🤍🖤❤️‍🔥💋💍💌🌹🥀💐😍🥰😘'),
  },
  {
    label: 'Bonds',
    icon: '🫶',
    emoji: split('🫶🤝👋🙌🫂👯🧑‍🤝‍🧑👭👫👬💑💏🏡🏠🔗🪢🧩🌈🏳️‍🌈🏳️‍⚧️⚧️♾️🌱🌳🐾'),
  },
  {
    label: 'Spicy',
    icon: '🔥',
    emoji: split('🔥🌶️🍑🍆💦😈👅⛓️🔒🔐🗝️🕯️🖤🥵😏🪶🎭🍷🥂'),
  },
  {
    label: 'Vibes',
    icon: '✨',
    emoji: split('🌼🌸🌻🍀✨⭐🌟🌙☀️💫🫧🪐🌊🎲🎮🎸🎨📚☕🍵🧸🎀🦋👑💎🔮🪄'),
  },
  {
    label: 'Signals',
    icon: '❓',
    emoji: split('❓❔❗💤💭💬👀🤔🙈🫣😶‍🌫️🌫️⏳⌛🚧🛑✅☑️❌➕🆕🔜🔁'),
  },
];

/** Cute defaults for a new person's random starting emoji. */
export const PERSON_STARTERS = split('🦊🐰🐸🐱🐻🦄🐙🦋🐝🐧🦉🐢🌸🌻🍄🌙⭐🍓🍑🧁🎀🪐🌊🔮🦔🦦🐼🐨');
