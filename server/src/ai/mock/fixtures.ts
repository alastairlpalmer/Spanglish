// Canned outputs for AI_MOCK mode. Every fixture passes the same zod schemas
// as live output, so client code is identical in both modes.

import type {
  ArticleResponse,
  CardsResponse,
  CheckResponse,
  DrillResponse,
  ReviewResponse,
  TranslateResponse,
} from '@seiscientas/shared';

export const mockCards: CardsResponse = {
  cards: [
    { es: 'Se me olvidó apagar la estufa antes de salir.', en: 'I forgot to turn off the stove before leaving.', word: 'estufa', wordEn: 'stove', note: 'In Spain "estufa" is a heater; the cooker is "cocina" or "fogón".' },
    { es: 'El alquiler sube cada año y nadie hace nada.', en: 'The rent goes up every year and nobody does anything.', word: 'alquiler', wordEn: 'rent', note: 'In Latin America you will also hear "la renta".' },
    { es: 'No te preocupes, yo me encargo de la cuenta.', en: "Don't worry, I'll take care of the bill.", word: 'encargarse', wordEn: 'to take care of', note: 'Always reflexive with "de": encargarse de algo.' },
    { es: 'Llevo dos semanas esperando una respuesta del banco.', en: "I've been waiting two weeks for an answer from the bank.", word: 'llevar', wordEn: 'to have been (doing)', note: 'llevar + time + gerund — no perfect tense needed.' },
    { es: 'La reunión se aplazó hasta el jueves que viene.', en: 'The meeting was postponed until next Thursday.', word: 'aplazar', wordEn: 'to postpone', note: 'Common in news and office Spanish; "posponer" also works.' },
    { es: 'Hace falta más leche para la receta.', en: 'More milk is needed for the recipe.', word: 'hacer falta', wordEn: 'to be needed', note: 'Works like gustar: what is needed is the subject.' },
    { es: 'Me da igual el color, elige tú.', en: "I don't mind the colour, you choose.", word: 'dar igual', wordEn: 'to not matter (to someone)', note: 'Gustar-type construction: me da igual, te da igual.' },
    { es: 'Al final conseguimos entradas para el concierto.', en: 'In the end we got tickets for the concert.', word: 'conseguir', wordEn: 'to get, obtain', note: 'e→i stem change: consigo, conseguiste.' },
  ],
};

export const mockCheckCorrect: CheckResponse = {
  correct: true,
  issue: null,
  concept: null,
};

export const mockCheckWrong: CheckResponse = {
  correct: false,
  issue: 'You used ser for a temporary state — location and mood take estar.',
  concept: 'ser-vs-estar',
};

export const mockDrill: DrillResponse = {
  cards: [
    { prompt: 'I am tired today.', answer: 'Estoy cansado hoy.', accepts: ['Hoy estoy cansado.'] },
    { prompt: 'She is a doctor.', answer: 'Es médica.', accepts: ['Ella es médica.', 'Ella es doctora.'] },
    { prompt: 'The coffee is cold.', answer: 'El café está frío.', accepts: [] },
    { prompt: 'We are in the kitchen.', answer: 'Estamos en la cocina.', accepts: [] },
    { prompt: 'My brother is very tall.', answer: 'Mi hermano es muy alto.', accepts: [] },
    { prompt: 'The party is at my house.', answer: 'La fiesta es en mi casa.', accepts: [] },
    { prompt: 'You look beautiful tonight.', answer: 'Estás guapa esta noche.', accepts: ['Estás muy guapa esta noche.'] },
    { prompt: 'The soup is delicious (right now).', answer: 'La sopa está riquísima.', accepts: ['La sopa está deliciosa.'] },
  ],
};

export const mockTalkReplies: string[] = [
  'Pues mira, el piso tiene dos habitaciones y da a la calle. ¿Cuánto tiempo llevas buscando?',
  'Ya, eso pasa mucho por esta zona. ¿Y qué presupuesto tienes al mes?',
  'Vale, con eso se puede encontrar algo, aunque justito. ¿Te importa compartir con alguien?',
  'Entiendo. Oye, ¿y para cuándo necesitas entrar en el piso?',
  'Perfecto, eso nos da margen. ¿Tienes nómina o aval? Es que el casero lo pide.',
];

export const mockArticle: ArticleResponse = {
  headline: 'La ciudad estrena una nueva línea de metro tras años de obras',
  body: 'Después de casi seis años de obras, la ciudad inauguró ayer una nueva línea de metro que conecta el aeropuerto con el centro. Miles de personas hicieron cola desde temprano para subir a los primeros trenes. El trayecto completo dura veinticinco minutos, la mitad del tiempo que tomaba en autobús. Las autoridades esperan que la línea reduzca el tráfico en las avenidas principales, que suelen estar colapsadas en hora punta. Sin embargo, algunos vecinos se quejan del precio del billete, que subió con la apertura. Los comerciantes cerca de las nuevas estaciones, en cambio, celebran la llegada de más clientes. Durante el primer mes, el gobierno ofrecerá descuentos para animar a la gente a dejar el coche en casa.',
  source: 'El País',
  gloss: [
    { word: 'estrena', meaning: 'debuts, opens for the first time' },
    { word: 'obras', meaning: 'construction works' },
    { word: 'inauguró', meaning: 'inaugurated' },
    { word: 'hicieron cola', meaning: 'queued up' },
    { word: 'trayecto', meaning: 'journey, route' },
    { word: 'autoridades', meaning: 'authorities' },
    { word: 'colapsadas', meaning: 'gridlocked' },
    { word: 'hora punta', meaning: 'rush hour' },
    { word: 'vecinos', meaning: 'residents, neighbours' },
    { word: 'se quejan', meaning: 'complain' },
    { word: 'billete', meaning: 'ticket' },
    { word: 'comerciantes', meaning: 'shopkeepers' },
    { word: 'animar', meaning: 'to encourage' },
  ],
};

export const mockTranslate: TranslateResponse = {
  feedback:
    'You missed "la mitad del tiempo" — it means half the time, not "less time". "Se quejan del precio" is complain about the price; you wrote "worry about", which is softer than the Spanish. "En cambio" marks contrast (on the other hand) and you dropped it, so your version loses the shopkeepers-versus-residents structure. The rest carries the meaning accurately.',
  errors: [
    {
      wrong: 'read "tomaba" as a completed one-off action',
      right: 'the imperfect "tomaba" describes what the journey used to take',
      why: 'The imperfect marks ongoing or habitual past, not a single event.',
      concept: 'preterite-vs-imperfect',
    },
  ],
};

export const mockReview: ReviewResponse = {
  errors: [
    { wrong: 'Yo soy buscando un piso', right: 'Estoy buscando un piso', why: 'Progressive actions take estar, never ser.', concept: 'ser-vs-estar' },
    { wrong: 'la problema es el precio', right: 'el problema es el precio', why: 'Problema is masculine despite ending in -a.', concept: 'gender-agreement' },
    { wrong: 'ayer yo hablo con el casero', right: 'ayer hablé con el casero', why: 'A completed past action takes the preterite.', concept: 'preterite-vs-imperfect' },
  ],
  worstHabit: 'You default to the present tense whenever the past is required — the preterite is missing from your speech entirely.',
};
