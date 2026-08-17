import {Router} from 'express';
import {getCountryController} from './country.controller.js';
const router = Router();

router.get('/countries', getCountryController);

export default router;