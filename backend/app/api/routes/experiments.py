from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.schemas.experiment import ExperimentCreateRequest, ExperimentResponse
from app.services.experiment_service import ExperimentService

router = APIRouter()

@router.post('', response_model=ExperimentResponse, include_in_schema=False)
@router.post('/', response_model=ExperimentResponse)
def create_experiment(payload: ExperimentCreateRequest, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return ExperimentService.create(db, payload)

@router.get('', response_model=list[ExperimentResponse], include_in_schema=False)
@router.get('/', response_model=list[ExperimentResponse])
def list_experiments(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return ExperimentService.list_recent(db)
