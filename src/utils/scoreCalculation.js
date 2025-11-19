/**
 * Calculate vendor performance score
 * Price: 30%, Quality: 60%, Delivery: 10%
 */
export const calculateVendorScore = (vendorPOs, maxPOValue = 200000000) => {
  const totalPOValue = vendorPOs.reduce((sum, po) => sum + po.basicValue, 0);
  
  // 1. Price Score (30%)
  const priceScore = Math.min((totalPOValue / maxPOValue) * 30, 30);
  
  // 2. Quality Score (60%)
  const totalGrnQty = vendorPOs.reduce((sum, po) => sum + po.totalGrnQty, 0);
  const totalRejectQty = vendorPOs.reduce((sum, po) => sum + po.rejectQty, 0);
  const rejectionRate = totalGrnQty > 0 ? (totalRejectQty / totalGrnQty) * 100 : 0;
  const qualityScore = Math.max(0, 60 - (rejectionRate * 2));
  
  // 3. Delivery Score (10%)
  const ordersWithDates = vendorPOs.filter(po => po.deliveryDate && po.lastGrn);
  const delayedOrders = ordersWithDates.filter(po => {
    const delivery = new Date(po.deliveryDate.split('-').reverse().join('-'));
    const grn = new Date(po.lastGrn.split('-').reverse().join('-'));
    return grn > delivery;
  }).length;
  
  const onTimeRate = ordersWithDates.length > 0 
    ? ((ordersWithDates.length - delayedOrders) / ordersWithDates.length) * 100 
    : 100;
  const deliveryScore = (onTimeRate / 100) * 10;
  
  return {
    total: Math.round(priceScore + qualityScore + deliveryScore),
    price: Math.round(priceScore),
    quality: Math.round(qualityScore),
    delivery: Math.round(deliveryScore),
    rejectionRate: rejectionRate.toFixed(2),
    onTimeRate: onTimeRate.toFixed(1),
    totalPOValue,
    totalOrders: vendorPOs.length,
    delayedOrders
  };
};

export const calculateDelay = (deliveryDate, lastGrn) => {
  if (!deliveryDate || !lastGrn) return null;
  const delivery = new Date(deliveryDate.split('-').reverse().join('-'));
  const grn = new Date(lastGrn.split('-').reverse().join('-'));
  const diffTime = grn - delivery;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};