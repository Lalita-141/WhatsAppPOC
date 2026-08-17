import {getActiveCountries} from '../country/country.repository.js';

export const getCountries = async () => {
  const countries = await getActiveCountries();
  return countries;
}
