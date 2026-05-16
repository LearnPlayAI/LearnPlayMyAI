/**
 * Image preloading utility for card images
 * Ensures all card images are cached before gameplay begins
 */

/**
 * Preload a single image
 * @param {string} src - Image URL
 * @returns {Promise} - Resolves when image is loaded or rejects on error
 */
const preloadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
};

/**
 * Preload all card images for a collection
 * @param {Array} cards - Array of card objects with id and imageKey
 * @returns {Promise} - Resolves when all images are loaded
 */
export const preloadCardImages = async (cards) => {
  if (!cards || cards.length === 0) {
    return Promise.resolve([]);
  }

  // Get image URLs for cards that have images
  const imageUrls = cards
    .filter(card => card.imageKey) // Only cards with images
    .map(card => `/api/cards/${card.id}/image`);

  console.log(`Preloading ${imageUrls.length} card images...`);

  try {
    // Load all images in parallel
    const loadedImages = await Promise.all(
      imageUrls.map(url => preloadImage(url))
    );
    
    console.log(`Successfully preloaded ${loadedImages.length} card images`);
    return loadedImages;
  } catch (error) {
    console.warn('Some card images failed to preload:', error);
    // Continue anyway - missing images will load on demand
    return [];
  }
};

/**
 * Preload card images with progress tracking
 * @param {Array} cards - Array of card objects
 * @param {Function} onProgress - Callback for progress updates (loaded, total)
 * @returns {Promise} - Resolves when all images are loaded
 */
export const preloadCardImagesWithProgress = async (cards, onProgress = () => {}) => {
  if (!cards || cards.length === 0) {
    onProgress(0, 0);
    return Promise.resolve([]);
  }

  const imageUrls = cards
    .filter(card => card.imageKey)
    .map(card => `/api/cards/${card.id}/image`);

  const total = imageUrls.length;
  let loaded = 0;

  console.log(`Preloading ${total} card images with progress tracking...`);
  onProgress(loaded, total);

  const loadPromises = imageUrls.map(async (url) => {
    try {
      const result = await preloadImage(url);
      loaded++;
      onProgress(loaded, total);
      return result;
    } catch (error) {
      console.warn(`Failed to preload image: ${url}`, error);
      loaded++;
      onProgress(loaded, total);
      return null;
    }
  });

  const results = await Promise.all(loadPromises);
  console.log(`Completed preloading: ${loaded}/${total} images`);
  return results.filter(Boolean);
};