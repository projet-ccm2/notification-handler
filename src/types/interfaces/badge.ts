export interface Badge {
  id: string;
  title: string;
  img: string;
}

export interface Possesses {
  userId: string;
  badgeId: string;
  acquiredDate: string;
}
