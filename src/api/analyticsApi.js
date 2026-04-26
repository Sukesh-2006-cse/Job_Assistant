import apiClient from './apiClient';

export const getAnalyticsSummary = async () => {
    const response = await apiClient.get('/analytics/summary');
    return response.data;
};

export const getMarketSignals = async () => {
    const response = await apiClient.get('/analytics/market-signals');
    return response.data;
};

