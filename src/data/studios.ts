/**
 * Известные студии со своими страницами /studio/<slug>: их ищут как «аниме студии MAPPA», «все аниме ufotable».
 * id — студия Shikimori (фильтр studio в каталоге). Лёгкий список без текстов: его грузит страница тайтла
 * ради ссылки на студию. Вводные тексты страниц — в src/data/landings.ts (STUDIO_WORKS).
 */
export const STUDIOS: { id: number; slug: string; name: string }[] = [
  { id: 569, slug: 'mappa', name: 'MAPPA' },
  { id: 43, slug: 'ufotable', name: 'ufotable' },
  { id: 2, slug: 'kyoto-animation', name: 'Kyoto Animation' },
  { id: 11, slug: 'madhouse', name: 'Madhouse' },
  { id: 4, slug: 'bones', name: 'Bones' },
  { id: 858, slug: 'wit-studio', name: 'Wit Studio' },
  { id: 10, slug: 'production-ig', name: 'Production I.G' },
  { id: 1835, slug: 'cloverworks', name: 'CloverWorks' },
  { id: 56, slug: 'a-1-pictures', name: 'A-1 Pictures' },
  { id: 18, slug: 'toei-animation', name: 'Toei Animation' },
  { id: 21, slug: 'studio-ghibli', name: 'Studio Ghibli' },
  { id: 1, slug: 'pierrot', name: 'Studio Pierrot' },
  { id: 14, slug: 'sunrise', name: 'Sunrise' },
  { id: 44, slug: 'shaft', name: 'Shaft' },
  { id: 803, slug: 'trigger', name: 'Trigger' },
  { id: 7, slug: 'jc-staff', name: 'J.C.Staff' },
  { id: 287, slug: 'david-production', name: 'David Production' },
  { id: 314, slug: 'white-fox', name: 'White Fox' },
  { id: 95, slug: 'doga-kobo', name: 'Doga Kobo' },
  { id: 456, slug: 'lerche', name: 'Lerche' },
  { id: 441, slug: '8bit', name: '8bit' },
  { id: 132, slug: 'pa-works', name: 'P.A. Works' },
  { id: 73, slug: 'tms-entertainment', name: 'TMS Entertainment' },
  { id: 1591, slug: 'science-saru', name: 'Science SARU' },
  { id: 291, slug: 'comix-wave-films', name: 'CoMix Wave Films' },
  { id: 37, slug: 'studio-deen', name: 'Studio Deen' },
  { id: 112, slug: 'brains-base', name: "Brain's Base" },
  { id: 290, slug: 'kinema-citrus', name: 'Kinema Citrus' },
  { id: 6, slug: 'gainax', name: 'Gainax' },
  { id: 1109, slug: 'orange', name: 'Orange' },
  { id: 1993, slug: 'studio-bind', name: 'Studio Bind' },
  { id: 13, slug: 'studio-4c', name: 'Studio 4°C' },
]

/** Страница студии, если она есть в списке; иначе undefined (тогда ссылка ведёт в каталог с фильтром). */
export const studioPath = (id: number | string | null | undefined) => {
  const s = id == null ? undefined : STUDIOS.find((x) => String(x.id) === String(id))
  return s && `/studio/${s.slug}`
}
