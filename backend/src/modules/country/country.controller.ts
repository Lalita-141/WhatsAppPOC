import {Request,Response, NextFunction} from 'express';
import {getCountries} from '../country/country.service.js';
import { ApiError } from '../../utils/api-error.js';

export const getCountryController = async (_req: Request, res:Response, next:NextFunction)=>{

    try{
      
        const countries = await getCountries();
        res.status(200).json({
            success: true,
            message: "Countries fetched successfully",
           data: countries.map((country) => ({
        countryId: country.country_id.toString(),
        countryName: country.country_name,
        countryCode: country.country_code,
        isoCode: country.iso_code,
        iso3Code: country.iso3_code,
        flag: country.flag,
      })),
        });
    } catch (error) {
        next(error);
    }
}