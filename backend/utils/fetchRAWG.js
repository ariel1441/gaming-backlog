export async function fetchGameData(gameName) {
  try {
    const RAWG_API_KEY = process.env.RAWG_API_KEY;
    const BASE_URL = 'https://api.rawg.io/api/games';

    if (!RAWG_API_KEY) {
      console.error('RAWG_API_KEY is missing!');
      return null;
    }

    const searchUrl = `${BASE_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(gameName)}&page_size=1`;
    const searchRes = await fetch(searchUrl);

    if (!searchRes.ok) {
      console.error(`RAWG search failed: ${searchRes.status} ${searchRes.statusText}`);
      return null;
    }

    const searchData = await searchRes.json();
    const firstResult = searchData.results?.[0];
    if (!firstResult) {
      console.warn(`No search results found for: "${gameName}"`);
      return null;
    }

    const gameSlug = firstResult.slug;
    const detailUrl = `${BASE_URL}/${gameSlug}?key=${RAWG_API_KEY}`;

    const detailRes = await fetch(detailUrl);

    if (!detailRes.ok) {
      console.error(`RAWG detail fetch failed for slug "${gameSlug}": ${detailRes.status} ${detailRes.statusText}`);
      return null;
    }

    const gameDetails = await detailRes.json();
    console.log('Game details fetched:', gameDetails.name);

    return gameDetails;

  } catch (err) {
    console.error(`Error fetching game data from RAWG for "${gameName}":`, err);
    return null;
  }
}
