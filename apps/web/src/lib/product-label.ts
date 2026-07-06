export type ProductLabelSource = {
  name: string;
  size?: string | null;
};

export function formatProductName(product: ProductLabelSource) {
  return product.size ? `${product.name} - ${product.size}` : product.name;
}
