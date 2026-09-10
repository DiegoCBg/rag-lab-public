from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas.execution import ExecutionResponse
from app.services.execution_service import ExecutionService

router = APIRouter()

@router.get('', response_model=list[ExecutionResponse], include_in_schema=False)
@router.get('/', response_model=list[ExecutionResponse])
def list_executions(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return ExecutionService.list_recent(db)
