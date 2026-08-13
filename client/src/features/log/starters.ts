// Diary sentence starters — training wheels for the first months. Static and
// free; the client hides them entirely past A2, so the scaffolding removes
// itself as the learner grows.

export interface Starter {
  es: string;
  en: string;
}

export const STARTER_GROUPS: Array<{ label: string; items: Starter[] }> = [
  {
    label: 'empezar',
    items: [
      { es: 'Hoy', en: 'today' },
      { es: 'Esta mañana', en: 'this morning' },
      { es: 'Esta noche', en: 'tonight' },
      { es: 'Ayer', en: 'yesterday' },
      { es: 'Mañana voy a', en: "tomorrow I'm going to" },
    ],
  },
  {
    label: 'hacer',
    items: [
      { es: 'fui a', en: 'I went to' },
      { es: 'comí', en: 'I ate' },
      { es: 'trabajé mucho', en: 'I worked a lot' },
      { es: 'hablé con', en: 'I talked to' },
      { es: 'vi', en: 'I saw / watched' },
      { es: 'estudié español', en: 'I studied Spanish' },
    ],
  },
  {
    label: 'sentir',
    items: [
      { es: 'estoy cansado', en: "I'm tired" },
      { es: 'estoy contento', en: "I'm happy" },
      { es: 'me gusta', en: 'I like' },
      { es: 'no me gusta', en: "I don't like" },
      { es: 'quiero', en: 'I want' },
    ],
  },
  {
    label: 'unir',
    items: [
      { es: 'y', en: 'and' },
      { es: 'pero', en: 'but' },
      { es: 'porque', en: 'because' },
      { es: 'después', en: 'afterwards' },
      { es: 'con mi amigo', en: 'with my friend' },
      { es: 'en casa', en: 'at home' },
      { es: 'en el trabajo', en: 'at work' },
    ],
  },
];
