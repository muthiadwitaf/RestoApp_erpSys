const router = require('express').Router();
const { upload, processImage, deleteImageFile } = require('../../middleware/upload');
const { asyncHandler } = require('../../utils/helpers');

// POST /api/settings/upload
router.post('/', upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'File gambar diperlukan (jpg/png)' });
    }

    const { filename, url } = await processImage(req.file.buffer, req.file.mimetype);
    res.json({ url, filename });
}));

// DELETE /api/settings/upload
router.delete('/', asyncHandler(async (req, res) => {
    const { imageUrl } = req.body;
    if (imageUrl) {
        deleteImageFile(imageUrl);
    }
    res.json({ message: 'Image deleted' });
}));

module.exports = router;
