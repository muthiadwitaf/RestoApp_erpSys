const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '../../uploadedImage');

// Ensure base upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config: memory storage (sharp processes before writing to disk)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file JPG, PNG, dan WebP yang diizinkan'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max raw upload
});

/**
 * Process image: convert to WebP, resize max 800px wide, strip EXIF, quality 80.
 * @param {Buffer} buffer - raw image buffer from multer
 * @param {string} companyUuid - UUID of the company (used as subdirectory)
 * @returns {{ image_id, image_company_uuid, image_size_bytes, image_url }}
 */
async function processImage(buffer, companyUuid) {
    // Ensure company subdirectory exists
    const companyDir = path.join(UPLOAD_DIR, companyUuid);
    if (!fs.existsSync(companyDir)) {
        fs.mkdirSync(companyDir, { recursive: true });
    }

    const image_id = uuidv4();
    const filename = `${image_id}.webp`;
    const filepath = path.join(companyDir, filename);

    // Process: strip EXIF, resize max 800px wide (preserve aspect ratio), WebP q80
    const outputBuffer = await sharp(buffer)
        .withMetadata(false)                                // strip all EXIF
        .resize({ width: 800, withoutEnlargement: true })  // max 800px wide
        .webp({ quality: 80 })                             // convert to WebP
        .toBuffer();

    fs.writeFileSync(filepath, outputBuffer);

    return {
        image_id,
        image_company_uuid: companyUuid,
        image_size_bytes: outputBuffer.length,
        image_url: `/uploadedImage/${companyUuid}/${filename}`,
    };
}

/**
 * Delete an uploaded image file from disk.
 * @param {string} companyUuid
 * @param {string} imageId
 */
function deleteImageFile(companyUuid, imageId) {
    if (!companyUuid || !imageId) return;
    try {
        const filepath = path.join(UPLOAD_DIR, companyUuid, `${imageId}.webp`);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
    } catch (err) {
        console.error('Failed to delete image:', err.message);
    }
}

// Multer instance for HR/employee documents: allow images + PDF, 5MB limit
const fileFilterDoc = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file JPG, PNG, WebP, atau PDF yang diizinkan'), false);
    }
};

const uploadDoc = multer({
    storage,
    fileFilter: fileFilterDoc,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Multer khusus untuk DO captures: hanya image, 15MB (foto kamera Android bisa besar)
// Accept lebih banyak format: termasuk HEIC dari iPhone/beberapa Android
const fileFilterCapture = (req, file, cb) => {
    const allowed = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        'image/heic', 'image/heif',  // iPhone/beberapa kamera Android
        'image/bmp', 'image/gif',    // format lain yang didukung sharp
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error(`Tipe file '${file.mimetype}' tidak didukung. Gunakan JPG, PNG, atau WebP.`), false);
    }
};

const uploadCapture = multer({
    storage,
    fileFilter: fileFilterCapture,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

/**
 * Process and save a document (PDF or image) to a given directory.
 * Images are converted to WebP via sharp. PDFs are saved as-is.
 * @param {Buffer} buffer - raw file buffer from multer
 * @param {string} mimetype - MIME type of the file
 * @param {string} destDir  - absolute path to destination directory
 * @returns {{ fileUuid, filename, ext, sizeBytes, relPath }}
 */
async function processAndSaveDoc(buffer, mimetype, destDir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const fileUuid = uuidv4();

    if (mimetype === 'application/pdf') {
        const filename = `${fileUuid}.pdf`;
        const filepath = path.join(destDir, filename);
        fs.writeFileSync(filepath, buffer);
        return { fileUuid, filename, ext: 'pdf', sizeBytes: buffer.length };
    }

    // image (jpg/png/webp) => convert to WebP
    const filename = `${fileUuid}.webp`;
    const filepath = path.join(destDir, filename);
    const outputBuffer = await sharp(buffer)
        .withMetadata(false)
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    fs.writeFileSync(filepath, outputBuffer);
    return { fileUuid, filename, ext: 'webp', sizeBytes: outputBuffer.length };
}

/**
 * Process and save image as JPEG (untuk DO captures).
 * Strip EXIF, resize max 1920px wide, JPEG quality 85.
 * @param {Buffer} buffer - raw image buffer from multer
 * @param {string} destDir  - absolute path to destination directory
 * @returns {{ fileUuid, filename, ext, sizeBytes }}
 */
async function processAndSaveJpeg(buffer, destDir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const fileUuid = uuidv4();
    const filename = `${fileUuid}.jpg`;
    const filepath = path.join(destDir, filename);

    const outputBuffer = await sharp(buffer)
        .withMetadata(false)                                 // strip EXIF / GPS
        .rotate()                                            // auto-rotate berdasarkan EXIF orientation
        .resize({ width: 1920, withoutEnlargement: true })   // max 1920px wide
        .jpeg({ quality: 85, progressive: true })            // JPEG progressive
        .toBuffer();

    fs.writeFileSync(filepath, outputBuffer);
    return { fileUuid, filename, ext: 'jpg', sizeBytes: outputBuffer.length };
}

module.exports = { upload, uploadDoc, uploadCapture, processImage, processAndSaveDoc, processAndSaveJpeg, deleteImageFile, UPLOAD_DIR };
