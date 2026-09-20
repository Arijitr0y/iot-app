import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

async function fetchWithAuth(endpoint: string, options: FetchOptions = {}) {
  // Extract path and clean it up (always prefix with /api)
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let url = `${API_BASE_URL}/api${path}`;

  // Add query parameters if provided
  if (options.params) {
    const searchParams = new URLSearchParams(options.params);
    url += `?${searchParams.toString()}`;
  }

  // Get Supabase Session Token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Prepare headers
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  // Execute request
  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message) errorMessage = errorData.message;
      if (errorData.error) errorMessage = errorData.error;
    } catch {
      // Ignored: Response is not JSON
    }
    throw new Error(errorMessage);
  }

  // Attempt to parse JSON response, fallback to text/null
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  } else {
    return response.text();
  }
}

export const apiClient = {
  get: (endpoint: string, options?: FetchOptions) => 
    fetchWithAuth(endpoint, { ...options, method: 'GET' }),
    
  post: (endpoint: string, data?: any, options?: FetchOptions) => 
    fetchWithAuth(endpoint, { 
      ...options, 
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    }),
    
  put: (endpoint: string, data?: any, options?: FetchOptions) => 
    fetchWithAuth(endpoint, { 
      ...options, 
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    }),
    
  delete: (endpoint: string, options?: FetchOptions) => 
    fetchWithAuth(endpoint, { ...options, method: 'DELETE' }),
};
