from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException

from app.models.action_item import ActionItem
from app.schemas.action_item import ActionItemResponse, ActionItemUpdate

router = APIRouter()


def _to_response(item: ActionItem) -> ActionItemResponse:
    return ActionItemResponse(
        id=str(item.id),
        meeting_id=item.meeting_id,
        task=item.task,
        owner=item.owner,
        deadline=item.deadline,
        priority=item.priority,
        status=item.status,
        source_text=item.source_text,
        created_at=item.created_at,
    )


@router.get("/{meeting_id}", response_model=list[ActionItemResponse])
async def get_action_items(meeting_id: str):
    items = await ActionItem.get_by_meeting(meeting_id)
    return [_to_response(i) for i in items]


@router.patch("/{item_id}", response_model=ActionItemResponse)
async def update_action_item(item_id: str, body: ActionItemUpdate):
    item = await ActionItem.get(PydanticObjectId(item_id))
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    await item.save()
    return _to_response(item)
