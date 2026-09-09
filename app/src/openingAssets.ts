import { Image } from 'react-native';
import { UI2 } from './ui2/assets';
import { ARENAS, arenaArt, arenaIndexFor } from './ui2/products';

const HOME_ART = [UI2.home_modes_art, UI2.md_bot, UI2.nav_store, UI2.nav_collection,
  UI2.nav_play, UI2.nav_friends, UI2.nav_tournaments];
export async function warmOpeningAssets(trophies: number): Promise<void> {
  const assets = [arenaArt(ARENAS[arenaIndexFor(trophies)]!.key), ...HOME_ART];
  await Promise.allSettled(assets.map(source => {
    const uri = Image.resolveAssetSource(source)?.uri;
    return uri ? Image.prefetch(uri) : Promise.resolve(false);
  }));
}
