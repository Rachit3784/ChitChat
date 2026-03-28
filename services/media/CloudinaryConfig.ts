// services/media/CloudinaryConfig.ts

/**
 * Cloudinary Configuration
 * 
 * To get these credentials:
 * 1. Sign up at https://cloudinary.com/
 * 2. Go to Dashboard to find your Cloud Name.
 * 3. Go to Settings -> Upload -> Upload Presets to create/find an Unsigned Upload Preset.
 */
export const CLOUDINARY_CONFIG = {
  CLOUD_NAME: 'dd5ytgt2j',
  UPLOAD_PRESET: 'ChitChat',       // ← Your unsigned preset name (case-sensitive!)
  RAW_UPLOAD_PRESET: 'ChitChat',   // Same preset handles raw encrypted blob uploads
  IMAGES_FOLDER: 'chitChat/ChatImages',
  THUMBS_FOLDER: 'chitChat/ChatImages/thumbs',
};
