import { environments } from '../../environments/environment_constant';
import { storageService } from '../storage';

/**
 * Common fetchApi method for network requests across the application
 */
export const fetchApi = async (...args: any[]): Promise<any> => {
  let [method, url, token, isForm, body, resType, contentType] = args;

  let headers: Record<string, string> = {};

  const resolvedToken = token || storageService.getToken();
  if (resolvedToken) {
    headers['Authorization'] = 'Bearer ' + resolvedToken;
  }

  if (!isForm) {
    headers['Content-Type'] = contentType || 'application/json';
  }

  let options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = isForm ? body : JSON.stringify(body);
  }

  if (method === 'POST' && (url.includes((environments as any).py_prod) || url.includes((environments as any).py_dev))) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}timeZone=${encodeURIComponent(timeZone)}`;
  }

  try {
    // Add 60 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    // Check if response is OK
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      const apiError: any = new Error(`${errorData.message || response.statusText}`);
      apiError.status = response.status;
      apiError.data = errorData;
      console.warn('Fetch error response body:', errorData);
      throw apiError;
    }

    return resType ? response.blob() : response.json();
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message === 'Aborted') {
      console.log('Fetch request aborted/cancelled (Timeout or screen navigation).');
    } else {
      console.warn('Fetch error details:', error.message);
      console.warn('Full error:', error);
    }
    throw error;
  }
};
