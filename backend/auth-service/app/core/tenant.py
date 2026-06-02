from sqlalchemy.orm import Session

def filter_by_shop(query, model, shop_id):
    """
    Automatically restrict data to current shop
    """
    return query.filter(model.shop_id == shop_id)